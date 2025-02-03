const net = require("net")
const fs = require('fs');

if (!fs.existsSync('easytunnel.server.json')) {
    fs.writeFileSync('easytunnel.server.json',`{
    "port": 65535,
    "token": "mySecretToken"
}`)
    console.log("Config file created")
}else{
    const data = JSON.parse(fs.readFileSync('easytunnel.server.json', 'utf8'))

    const port = data["port"]

    const token = data["token"]

    var clients = {}
    var clientsMissedPackets = {}

    const server = net.createServer(async (socket) => {
            socket.once('data', (data) => {
                if (data.toString() == token){
                    socket.write("verifiedAgent")
                    socket.once('data', (data) => {
                        var port = data.toString()
                            
                        const server2 = net.createServer((srv)=>{
                            var id = Math.floor(Math.random()*10000000).toString()
                            socket.write(`newClient${id}`)
                            clients[id] = srv
                            clientsMissedPackets[id] = []
                            srv.on('data',data=>{
                                var list = clientsMissedPackets[id]
                                if(list){
                                    list.push(data)
                                    clientsMissedPackets[id] = list
                                }
                            })
                            srv.on("error",()=>{srv.end()})
                        })
                        server2.listen(port,()=>{
                        })

                        server2.once("listening",()=>{
                            socket.write("registeredPorts")
                            server2.on("error",()=>{})
                        })

                        server2.once("error",()=>{
                            socket.write("failedRegister")
                            socket.end()
                        })

                        socket.on('end', () => {
                            server2.close()
                        });
                
                        socket.on('error',()=>{
                            server2.close()
                        })
                        
                    })
                }else if(data.toString() == `${token}Client`){
                    socket.write("verifiedConnection")
                    socket.once("data",(data)=>{
                        var id = data.toString()
                        socket.write("connected")
                        socket.on('end', () => {
                            if(clients[id]){clients[id].end()}
                            delete clients[id]
                        });
            
                        socket.on('error',()=>{
                            if(clients[id]){clients[id].end()}
                            socket.end();
                            delete clients[id]
                        })
                        clients[id].on('end',()=>{
                            socket.end();
                            delete clients[id]
                        })
                        clients[id].on('error',()=>{
                            if(clients[id]){clients[id].end()}
                            socket.end();
                            delete clients[id]
                        })
                        setTimeout(()=>{
                            for(var x in clientsMissedPackets[id]){
                                socket.write(clientsMissedPackets[id][x])
                            }
                            delete clientsMissedPackets[id]
                            if(clients[id]){
                                clients[id].on("data",data=>{
                                    socket.write(data)
                                })
                                socket.on("data",data=>{
                                    clients[id].write(data)
                                })
                            }
                        },2000)
                    })
                }
            });
    });

    server.listen(port, () => {
        console.log(`EasyTunnel-Server listening on port ${port}`)
    });

}
