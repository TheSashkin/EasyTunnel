const net = require('net');
const fs = require('fs');
const path = require('path');
 
const CONFIG_FILE = 'easytunnel.agent.json';
const DEFAULT_CONFIG = {
  serverPort: 65535,
  serverIp: "127.0.0.1",
  token: "mySecretToken",
  ports: [
    [25565, 25566],
    [25567, 25568]
  ]
};

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

async function handleClientConnection(id, port, config) {
  const { serverPort, serverIp, token } = config;
  
  const clientCon = net.createConnection({ 
    port: serverPort, 
    host: serverIp 
  });
  
  clientCon.on('error', () => {});
  
  clientCon.on('connect', () => {
    clientCon.write(`${token}Client`);
    
    clientCon.once("data", (data) => {
      if (data.toString() === "verifiedConnection") {
        clientCon.write(id);
        
        clientCon.once("data", data => {
          if (data.toString() === "connected") {
            createLocalConnection(clientCon, port);
          } else {
            clientCon.end();
          }
        });
      } else {
        clientCon.end();
      }
    });
  });
}

function createLocalConnection(clientCon, port) {
  const localService = net.createConnection({ 
    port: port, 
    host: "127.0.0.1" 
  });
  
  localService.on('error', () => {
    clientCon.end();
  });

  localService.on('connect', () => {
    localService.on('data', (data) => {
      clientCon.write(data);
    });
    
    clientCon.on('data', (data) => {
      localService.write(data);
    });
    
    localService.on('end', () => {
      clientCon.end();
    });
    
    clientCon.on('end', () => {
      localService.end();
    });
  });
}

async function connectToServer(ports, config) {
  const { serverPort, serverIp, token } = config;
  const [localPort, remotePort] = ports;
  
  const client = net.createConnection({ 
    port: serverPort, 
    host: serverIp 
  });

  client.on('error', () => {
    setTimeout(() => connectToServer(ports, config), 5000);
  });
  
  client.on('connect', () => {
    client.write(token);
    
    client.once("data", (data) => {
      if (data.toString() === "verifiedAgent") {
        client.write(remotePort.toString());
        
        client.once("data", (data) => {
          const response = data.toString();
          
          if (response === "registeredPorts") {
            console.log(`Local port: ${localPort}. Remote port: ${remotePort}`);
            
            client.on('data', (data) => {
              const message = data.toString();
              if (message.startsWith("newClient")) {
                const id = message.split("newClient")[1];
                handleClientConnection(id, localPort, config);
              }
            });
          } else if (response === "failedRegister") {
            console.log(`Failed. Local port: ${localPort}. Remote port: ${remotePort}`);
            client.end();
          }
        });
      } else {
        client.end();
      }
    });
  });
  
  client.on('end', () => {
    setTimeout(() => connectToServer(ports, config), 5000);
  });
}

function main() {
  try {
    const config = initializeConfig();
    
    console.log(`===========================`);
    console.log(`Server IP: ${config.serverIp}`);
    console.log(`Server port: ${config.serverPort}`);
    console.log(`===========================`);
    
    config.ports.forEach(portPair => {
      connectToServer(portPair, config);
    });
  } catch (error) {
    console.error(`Application error: ${error.message}`);
  }
}

main();