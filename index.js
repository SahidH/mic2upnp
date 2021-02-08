const spawn = require('child_process').spawn;
const { Subject } = require('rxjs');
const http = require('http');
const header = require("waveheader");
const express = require('express')
const app = express();
const port = 8080;

const sampleRate = 192000;
const bitDepth = 32;
const channels = 2;
const createAudioBuffer = () => spawn('arecord',
    [
        '-c', channels,
        '-r', sampleRate,
        '-f', `S${bitDepth}_LE`,
        '-D', 'plughw:1,0',
        '-q',
        '-M',
        '--disable-resample',
        '--disable-softvol',
        '--buffer-size', 1024 * 4,
        '-t', 'raw'
    ], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore']
});

const audioStream = new Subject();

const createAudioProcess = () => {
    const audioBuffer = createAudioBuffer();
    const audioProcess = audioBuffer.stdout;
    audioProcess.on('data', b => audioStream.next(b));
    audioBuffer.on('exit', e => {
        //console.log('exit')
        createAudioProcess();
    });
    audioBuffer.on('close', e => {
        //console.log('close')
        createAudioProcess();
    });
}

createAudioProcess();

const ip = require('internal-ip').v4.sync();
app.use(function (req, res, next) {
    res.header('transferMode.dlna.org', 'Streaming');
    res.header('contentFeatures.dlna.org', 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000');
    res.header('getmediainfo.sec', 'SEC_Duration=2555856');
    next();
});
app.get('/next-wav', (request, response) => {
    //console.log(request);
    response.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Transfer-Encoding': 'chunked'
    });
    switch (request.method) {
        case "HEAD":
            response.end();
            break;
        default:
            response.shouldKeepAlive = true;
            response.write(header(0, {
                sampleRate,
                channels,
                bitDepth
            }));
            audioStream.subscribe({ next: b => response.write(b) });
            break;
    }
});

const server = app.listen(port, () => console.log(`Streaming at http://localhost:${port}`));
server.on('connection', function (socket) {
    socket.setTimeout(20000 * 1000);
});
server.on('upgrade', (req, socket, upgradeHead) => {
    //console.log('req.headers.upgrade', req.headers.upgrade);
    //console.log('socket', socket);
    //console.log('upgradeHead', upgradeHead);
})

server.keepAliveTimeout = 61 * 1000;
server.headersTimeout = 65 * 1000;

const upnpControllerServer = http
    .createServer((request, response) => {
        const MediaRendererClient = require('upnp-mediarenderer-client');
        const RendererFinder = require('renderer-finder');
        const finder = new RendererFinder();
        finder.on('found', function (info, msg, desc) {
            //console.log(desc.device.manufacturer);
            if (desc && desc.device && desc.device.manufacturer.includes('Devialet')) {
                //console.log("sending to", msg.location);
                const client = new MediaRendererClient(msg.location);
                const loadUrl = `http://${ip}:${port}/next-wav`;
                //console.log("loadUrl", loadUrl)
                client.load(loadUrl, {
                    autoplay: true,
                    contentType: 'audio/wav',
                }, (err, devRespone) => {
                    err && response.end(JSON.stringify({ err }));
                    devRespone && response.end(JSON.stringify({ response: devRespone }));
                });
                client.on('status', function (status) {
                    // Reports the full state of the AVTransport service the first time it fires,
                    // then reports diffs. Can be used to maintain a reliable copy of the
                    // service internal state.
                    //console.log("status", status);
                });

                client.on('loading', function () {
                    //console.log('loading');
                });

                client.on('playing', function () {
                    //console.log('playing');

                    client.getPosition(function (err, position) {
                        //console.log(position); // Current position in seconds
                    });

                    client.getDuration(function (err, duration) {
                        //console.log(duration); // Media duration in seconds
                    });
                });

                client.on('paused', function () {
                    //console.log('paused');
                });

                client.on('stopped', function () {
                    //console.log('stopped');
                });

                client.on('speedChanged', function (speed) {
                    // Fired when the user rewinds of fast-forwards the media from the remote
                    //console.log('speedChanged', speed);
                });
            }

        });

        finder.start(true);
    });

upnpControllerServer.listen(port + 1);
// setInterval(() => {
//     audioServer.getConnections((count) => {
//         if (count === 0) {
//             // micInstance && micInstance.stop();
//             // micInstance = null;
//         }
//     });
// }, 200);
