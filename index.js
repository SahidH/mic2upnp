const spawn = require('child_process').spawn;

const http = require('http');
const header = require("waveheader");
const port = 8080;

const audioProcess = spawn('arecord', ['-c', '2', '-r', '192000', '-f', 'S32_LE', '-D', 'plughw:1,0'], {
    stdio: ['ignore', 'pipe', 'ignore']
});

const ip = require('internal-ip').v4.sync();
const audioServer = http
    .createServer((request, response) => {
        response.writeHead(200, {
            'Content-Type': 'audio/wav',
            'Transfer-Encoding': 'chunked',
            'Connection': 'keep-alive',
        });
        switch (request.method) {
            case "HEAD":
                response.end();
                break;
            default:
                response.write(header(0, {
                    sampleRate: 192000,
                    channels: 2,
                    bitDepth: 32
                }));
                audioProcess.stdout.pipe(response);
                break;
        }
    });


const upnpControllerServer = http
    .createServer((request, response) => {
        const MediaRendererClient = require('upnp-mediarenderer-client');
        const RendererFinder = require('renderer-finder');
        const finder = new RendererFinder();
        finder.on('found', function (info, msg, desc) {
            if (desc && desc.device && desc.device.manufacturer.includes('Devialet')) {
                console.log("sending to", msg.location);
                const client = new MediaRendererClient(msg.location);
                const loadUrl = `http://${ip}:${port}/next-wav`;
                console.log("loadUrl", loadUrl)
                client.load(loadUrl, {
                    autoplay: true,
                    contentType: 'audio/wav'
                }, (err, devRespone) => {
                    err && response.end(JSON.stringify({ err }));
                    devRespone && response.end(JSON.stringify({ response: devRespone }));
                });
            }

        });

        finder.start(true);
    });
audioServer.listen(port);
upnpControllerServer.listen(port + 1);
// setInterval(() => {
//     audioServer.getConnections((count) => {
//         if (count === 0) {
//             // micInstance && micInstance.stop();
//             // micInstance = null;
//         }
//     });
// }, 200);
