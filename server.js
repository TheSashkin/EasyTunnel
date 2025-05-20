const net = require('net');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = 'easytunnel.server.json';
const DEFAULT_CONFIG = {
  port: 65535,
  token: "mySecretToken"
};

const clients = {};
const clientsMissedPackets = {};
const portServers = {};

function initializeConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
      console.log("Config file created");
      return DEFAULT_CONFIG;
    } else {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error handling configuration: ${error.message}`);
    process.exit(1);
  }
}

function generateConnectionId() {
  return Math.floor(Math.random() * 10000000).toString();
}

function closeExistingPortServer(port) {
  return new Promise((resolve) => {
    if (portServers[port]) {
      const existingServer = portServers[port].server;
      delete portServers[port];
      
      if (existingServer.listening) {
        existingServer.close(() => {
          resolve();
        });
        
        existingServer.getConnections((err, count) => {
          if (!err && count > 0) {
            existingServer.unref();
          }
        });
        
        setTimeout(() => {
          resolve();
        }, 1000);
      } else {
        resolve();
      }
    } else {
      resolve();
    }
  });
}

function handleAgentConnection(socket) {
  socket.write("verifiedAgent");
  
  socket.once('data', async (data) => {
    const remotePort = parseInt(data.toString(), 10);
    
    if (isNaN(remotePort)) {
      socket.write("failedRegister");
      socket.end();
      return;
    }
    
    try {
      await closeExistingPortServer(remotePort);
      
      const portServer = net.createServer((clientSocket) => {
        const id = generateConnectionId();
        
        socket.write(`newClient${id}`);
        
        clients[id] = clientSocket;
        clientsMissedPackets[id] = [];
        
        clientSocket.on('data', (data) => {
          if (clientsMissedPackets[id]) {
            clientsMissedPackets[id].push(data);
          }
        });
        
        clientSocket.on("error", () => {
          clientSocket.end();
        });
      });
      
      portServer.on("error", () => {
        socket.write("failedRegister");
        socket.end();
        if (portServers[remotePort] && portServers[remotePort].server === portServer) {
          delete portServers[remotePort];
        }
      });
      
      portServer.listen(remotePort, () => {
        portServers[remotePort] = {
          server: portServer,
          agentSocket: socket
        };
        
        socket.write("registeredPorts");
        console.log(`Tunnel opened on port ${remotePort}`);
      });
      
      socket.on('end', () => {
        cleanupAgentResources(socket);
      });
      
      socket.on('error', () => {
        cleanupAgentResources(socket);
      });
    } catch (err) {
      socket.write("failedRegister");
      socket.end();
    }
  });
}

function cleanupAgentResources(agentSocket) {
  Object.keys(portServers).forEach(port => {
    if (portServers[port].agentSocket === agentSocket) {
      const server = portServers[port].server;
      
      delete portServers[port];
      
      if (server && server.listening) {
        server.close();
        
        server.getConnections((err, count) => {
          if (!err && count > 0) {
            server.unref();
          }
        });
      }
    }
  });
}

function handleClientConnection(socket) {
  socket.write("verifiedConnection");
  
  socket.once("data", (data) => {
    const id = data.toString();
    
    if (!clients[id]) {
      socket.end();
      return;
    }
    
    socket.write("connected");
    
    const clientSocket = clients[id];
    
    const cleanup = () => {
      if (clients[id]) {
        clients[id].end();
      }
      delete clients[id];
      delete clientsMissedPackets[id];
    };
    
    socket.on('end', cleanup);
    socket.on('error', () => {
      cleanup();
      socket.end();
    });
    
    clientSocket.on('end', () => {
      socket.end();
      delete clients[id];
    });
    
    clientSocket.on('error', () => {
      cleanup();
    });
    
    setTimeout(() => {
      if (clients[id]) {
        if (clientsMissedPackets[id] && clientsMissedPackets[id].length > 0) {
          clientsMissedPackets[id].forEach(packet => {
            socket.write(packet);
          });
          delete clientsMissedPackets[id];
        }
        
        clientSocket.on("data", data => {
          socket.write(data);
        });
        
        socket.on("data", data => {
          if (clients[id]) {
            clients[id].write(data);
          }
        });
      }
    }, 2000);
  });
}

function main() {
  try {
    const config = initializeConfig();
    const { port, token } = config;
    
    const server = net.createServer((socket) => {
      socket.on('error', () => {});
      
      socket.once('data', (data) => {
        const message = data.toString();
        
        if (message === token) {
          handleAgentConnection(socket);
        } else if (message === `${token}Client`) {
          handleClientConnection(socket);
        } else {
          socket.end();
        }
      });
    });
    
    server.on('error', (err) => {
      console.error(`Server error: ${err.message}`);
      process.exit(1);
    });
    
    server.listen(port, () => {
      console.log(`EasyTunnel-Server listening on port ${port}`);
    });
  } catch (error) {
    console.error(`Application error: ${error.message}`);
  }
}

main();