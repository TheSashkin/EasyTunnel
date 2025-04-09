const net = require('net');
const fs = require('fs');

const CONFIG_FILE = 'easytunnel.server.json';
const DEFAULT_CONFIG = {
  port: 65535,
  token: "mySecretToken"
};

const clients = {};
const clientsMissedPackets = {};

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

function handleAgentConnection(socket) {
  socket.write("verifiedAgent");
  
  socket.once('data', (data) => {
    const remotePort = parseInt(data.toString(), 10);
    
    if (isNaN(remotePort)) {
      socket.write("failedRegister");
      socket.end();
      return;
    }
    
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
      
      clientSocket.on("error", (err) => {
        console.error(`Client socket error: ${err.message}`);
        clientSocket.end();
      });
    });
    
    portServer.listen(remotePort, () => {
      socket.write("registeredPorts");
      console.log(`Tunnel opened on port ${remotePort}`);
    });
    
    portServer.on("error", (err) => {
      console.error(`Port server error on port ${remotePort}: ${err.message}`);
      socket.write("failedRegister");
      socket.end();
    });
    
    socket.on('end', () => {
      console.log(`Agent disconnected, closing port ${remotePort}`);
      portServer.close();
    });
    
    socket.on('error', (err) => {
      console.error(`Agent socket error: ${err.message}`);
      portServer.close();
    });
  });
}

function handleClientConnection(socket) {
  socket.write("verifiedConnection");
  
  socket.once("data", (data) => {
    const id = data.toString();
    
    if (!clients[id]) {
      console.error(`Client tried to connect with invalid ID: ${id}`);
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
    socket.on('error', (err) => {
      console.error(`Client connection error: ${err.message}`);
      cleanup();
      socket.end();
    });
    
    clientSocket.on('end', () => {
      socket.end();
      delete clients[id];
    });
    
    clientSocket.on('error', (err) => {
      console.error(`Client socket error: ${err.message}`);
      cleanup();
    });
    
    setTimeout(() => {
      if (clients[id]) {
        if (clientsMissedPackets[id]) {
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
      socket.on('error', (err) => {
        console.error(`Socket error: ${err.message}`);
      });
      
      socket.once('data', (data) => {
        const message = data.toString();
        
        if (message === token) {
          handleAgentConnection(socket);
        } else if (message === `${token}Client`) {
          handleClientConnection(socket);
        } else {
          console.log('Invalid connection attempt');
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