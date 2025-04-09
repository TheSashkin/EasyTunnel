const net = require('net');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = 'easytunnel.server.json';
const DEFAULT_CONFIG = {
  port: 65535,
  token: "mySecretToken"
};

// Storage for active client connections and pending packets
const clients = {};
const clientsMissedPackets = {};

// Track port servers by port number for proper cleanup
const portServers = {};

// Track agent connections by port
const portAgents = {};

/**
 * Initialize or load configuration
 * @returns {Object} The configuration object
 */
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

/**
 * Generate a unique connection ID
 * @returns {string} A unique ID
 */
function generateConnectionId() {
  return Math.floor(Math.random() * 10000000).toString();
}

/**
 * Close existing port server if it exists and disconnect the old agent
 * @param {number} port - The port to close
 * @returns {Promise<void>} Promise that resolves when the server is closed
 */
function closeExistingPortServer(port) {
  return new Promise((resolve) => {
    // First disconnect the old agent if it exists
    if (portAgents[port]) {
      console.log(`Disconnecting previous agent for port ${port}`);
      try {
        portAgents[port].end();
      } catch (err) {
        console.error(`Error disconnecting previous agent: ${err.message}`);
      }
      delete portAgents[port];
    }
    
    if (portServers[port]) {
      console.log(`Closing existing server on port ${port}`);
      // Get all client IDs associated with this port server
      const clientIds = Object.keys(clients).filter(id => 
        clients[id] && clients[id]._portServer === port);
      
      // Close each client connection
      clientIds.forEach(id => {
        if (clients[id]) {
          clients[id].end();
          delete clients[id];
          delete clientsMissedPackets[id];
        }
      });
      
      portServers[port].close(() => {
        delete portServers[port];
        resolve();
      });
      
      // Force close if it takes too long
      setTimeout(() => {
        if (portServers[port]) {
          delete portServers[port];
          resolve();
        }
      }, 1000);
    } else {
      resolve();
    }
  });
}

/**
 * Handle an agent connection
 * @param {net.Socket} socket - Agent socket
 */
function handleAgentConnection(socket) {
  socket.write("verifiedAgent");
  
  socket.once('data', async (data) => {
    const remotePort = parseInt(data.toString(), 10);
    
    if (isNaN(remotePort)) {
      socket.write("failedRegister");
      socket.end();
      return;
    }
    
    // Close any existing server on this port first and disconnect old agent
    await closeExistingPortServer(remotePort);
    
    // Register this socket as the agent for this port
    portAgents[remotePort] = socket;
    
    // Create a server on the requested remote port
    const portServer = net.createServer((clientSocket) => {
      const id = generateConnectionId();
      
      // Store port server reference in client for cleanup
      clientSocket._portServer = remotePort;
      
      // Notify agent about new client connection
      socket.write(`newClient${id}`);
      
      // Store client socket for later use
      clients[id] = clientSocket;
      clientsMissedPackets[id] = [];
      
      // Temporarily store incoming data until client connection is established
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
    
    // Store the server in our registry
    portServers[remotePort] = portServer;
    
    // Handle port server lifecycle
    try {
      portServer.listen(remotePort, () => {
        socket.write("registeredPorts");
        console.log(`Tunnel opened on port ${remotePort}`);
      });
      
      portServer.on("error", (err) => {
        console.error(`Port server error on port ${remotePort}: ${err.message}`);
        socket.write("failedRegister");
        delete portServers[remotePort];
        delete portAgents[remotePort];
        socket.end();
      });
    } catch (err) {
      console.error(`Failed to set up port server on ${remotePort}: ${err.message}`);
      socket.write("failedRegister");
      delete portAgents[remotePort];
      socket.end();
      return;
    }
    
    // Clean up on connection close
    socket.on('end', () => {
      console.log(`Agent disconnected, closing port ${remotePort}`);
      // Only close the port server if this is still the registered agent
      if (portAgents[remotePort] === socket) {
        closeExistingPortServer(remotePort);
      }
    });
    
    socket.on('error', (err) => {
      console.error(`Agent socket error: ${err.message} for port ${remotePort}`);
      // Only close the port server if this is still the registered agent
      if (portAgents[remotePort] === socket) {
        closeExistingPortServer(remotePort);
      }
    });
  });
}

/**
 * Handle a client connection
 * @param {net.Socket} socket - Client socket
 */
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
    
    // Set up cleanup handlers
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
    
    // After a short delay, start forwarding data
    setTimeout(() => {
      if (clients[id]) {
        // Send any missed packets
        if (clientsMissedPackets[id]) {
          clientsMissedPackets[id].forEach(packet => {
            socket.write(packet);
          });
          delete clientsMissedPackets[id];
        }
        
        // Set up data forwarding
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

/**
 * Main function
 */
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
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down server...');
      
      // Close all port servers
      Object.keys(portServers).forEach(port => {
        closeExistingPortServer(parseInt(port, 10));
      });
      
      server.close(() => {
        console.log('Server shutdown complete');
        process.exit(0);
      });
    });
    
    server.listen(port, () => {
      console.log(`EasyTunnel-Server listening on port ${port}`);
    });
  } catch (error) {
    console.error(`Application error: ${error.message}`);
  }
}

// Start the application
main();