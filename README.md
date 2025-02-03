# EasyTunnel
A barebones alternative to ngrok

## How to config
### Server
```json
{
    "port": 65535,
    "token": "mySecretToken"
}
```
- Port - port that will be used to communicate with agent
- Token - text that will be used for verifying your agents

### Agent
```json
{
    "serverPort": 65535,
    "serverIp": "127.0.0.1",
    "token": "mySecretToken",
    "ports": [
        [25565, 25566],
        [25567, 25568]
    ]
}
```
- serverPort - Communication port of your server
- serverIp - IP address of your server
- Token - text that will be used for verifying
- Ports - the local ports to forward and the remote ports to use for them
### Ports structure:
```json
{
    "ports": [
        ["local","remote"],
        ["local", "remote"]
    ]
}
```
