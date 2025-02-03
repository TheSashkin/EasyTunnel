const net = require('net');
const fs = require('fs');

if (!fs.existsSync('easytunnel.agent.json')) {
    fs.writeFileSync('easytunnel.agent.json',`{
    "serverPort": 65535,
    "serverIp": "127.0.0.1",
    "token": "mySecretToken",
    "ports": [
        [25565, 25566],
        [25567, 25568]
    ]
}`)
    console.log("Config file created")
}else{
    const data = JSON.parse(fs.readFileSync('easytunnel.agent.json', 'utf8'))

    const serverIp = data["serverIp"]
    const serverPort = data["serverPort"]
    const token = data["token"]
    const ports = data["ports"]

    console.log(`===========================\nServer IP: ${serverIp}`)
    console.log(`Server port: ${serverPort}\n===========================`)
    async function clientConnection(id, port) {
        const clientCon = net.createConnection({ port: serverPort, host: serverIp }, () => {
            clientCon.write(`${token}Client`)
            clientCon.once("data",(data)=>{
                if (data.toString()=="verifiedConnection"){
                    clientCon.write(id)
                    clientCon.once("data",data=>{
                        if(data.toString()=="connected"){
                            const locServ = net.createConnection({ port: port, host: "127.0.0.1" }, () => {
                                locServ.on('data',(data)=>{
                                    clientCon.write(data)
                                })
                                clientCon.on('data',(data)=>{
                                    locServ.write(data)
                                })
                                locServ.on('end',()=>{
                                    clientCon.end()
                                })
                                clientCon.on('end',()=>{
                                    locServ.end()
                                })
                            })
                        }
                    })
                }
            })
        })
    }

    async function connectToServer(ports) {
        const client = net.createConnection({ port: serverPort, host: serverIp }, () => {
            client.write(token);
            client.once("data",(data)=>{
                if (data.toString()=="verifiedAgent"){
                    client.write(ports[1].toString())
                    client.once("data",(data)=>{
                        if (data.toString()=="registeredPorts"){
                            console.log(`Local port: ${ports[0]}. Remote port: ${ports[1]}`)
                            client.on('data',(data)=>{
                                if(data.toString().startsWith("newClient")){
                                    var id = data.toString().split("newClient")[1]
                                    clientConnection(id, ports[0])
                                }
                            })
                        }else if(data.toString()=="failedRegister"){
                            console.log(`Failed. Local port: ${ports[0]}. Remote port: ${ports[1]}`);
                        }
                    })
                }
            })
        });
        
        client.on('end', () => {
            
        });
    }

    for(var port in ports){
        connectToServer(ports[port])
    }
}