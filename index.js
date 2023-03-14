const config = {
    cacheResetTime: 100
}

const http = require('http');

function unixTime() { return Math.floor(new Date().getTime() / 1000); }

const fs = require('node:fs');
const https = require('node:https');

const options = {
    key: fs.readFileSync( 'ssl/server-key.pem'),
    cert: fs.readFileSync('ssl/server-cert.pem'),
    port: 7891,
    host: "0.0.0.0"
};

const l = require('@connibug/js-logging');
console.log("Current directory:", __dirname);
l.setLogLevel("DEBUG");
l.setupFileLogging(__dirname + "/")

var url_parse = require('url').parse;

const host = '0.0.0.0';
const port = 7891;

let cache = [
    {
        url: "example.com",
        last_refreshed: 0,
        data: ""
    }
]

function serveCache(url, server_res) {
    for (let i = 0; i < cache.length; i++) {
        if(cache[i].url === url)  {
            let since = unixTime() - cache[i].last_refreshed;
            if(since > config.cacheResetTime)
                return false;

            server_res.writeHead(200, {
                'Content-Type': 'text/calendar',
                'Conlstent-Transfer-Encoding': 'Binary',
                'Content-Length': cache[i].data.length,
                'Content-Disposition': `attachment; filename=${server_res.file_name}`
            });
            server_res.end(cache[i].data);

            l.log(`Served ${url} from cache, cache for this url will reset in ${config.cacheResetTime - since} seconds`)
            return true;
        }
    }
    return false;
}
function cache_save(url, data) {
    cache.push({
        url: url,
        last_refreshed: unixTime(),

        data: data
    });
}

const requestListener = function (req, res) {
    // let tmp_url = `${Math.floor(Math.random() * 900) + 100}`;
    let url_query = url_parse(req.url, true).query;

    let url = url_query["custom_url"];
    if(url) {
        l.log(`Handling custom url: ${url}`);
        if(url.includes("kent.ac.uk")) {
            res.end("This is a kent ical link please use the kent_id param instead of custom_url");
            return;
        }

        server_res.file_name = `custom_url_${Math.floor(Math.random() * 900) + 100}.ics`;
        server_res.is_kent = true;
        handle(req, res, url);
        return;
    }

    let kent_id = url_query["kent_id"];
    if (kent_id ) {
        res.file_name = `${kent_id}.ics`;
        res.is_kent = true;
        l.log(`Handling kent timetable id: ${kent_id}`)
        handle(req, res, `https://www.kent.ac.uk/timetabling/ical/${kent_id}.ics`);
        return;
    }

    if(req.url == "/favicon.ico") {
        res.writeHead(404, {"Content-Type": "text/plain"});
        res.write("404 Not found");
        res.end();
        return;
    }

    l.warning("Found no valid params");
    l.log(`Query: ${req.url}`);
};

function handle(server_req, server_res, url) {
    if(serveCache(url, server_res)) {
        return;
    }

    l.debug(`Downloading file: ${url}`);

    let handler = url.startsWith("https://") ? https : http;
    try {
        handler.get(url, (res) => {
            l.debug(`Starting to stream data from -> ${url}`);
            // let file_name = `${Math.floor(Math.random() * 900) + 100}-${path.basename(url)}`;
            // l.log(`Streaming to ${file_name}`);

            res.setEncoding('binary');

            let chunks = [];
            let chunk_cnt = 0;

            res.on('data', (chunk) => {
                l.verbose(`Chunk ${chunk_cnt}`);

                if (server_res.is_kent) {
                    const pattern = /ORGANIZER;CN=University of Kent/mg;
                    const replacement = 'ORGANIZER;CN=University of Kent:filler@example.com';

                    chunk = chunk.toString().replace(pattern, replacement);
                }

                chunks.push({
                    id: chunk_cnt,
                    data: chunk
                }); ++chunk_cnt;
            });

            res.on('end', () => {
                let data = "";
                {
                    let next_chunk = 0;
                    while (next_chunk < chunks.length)
                        chunks.forEach(chunk => {
                            l.verbose("Looking for Chunk ID: " + chunk.id);
                            if (chunk.id === next_chunk) {
                                l.verbose("Found Chunk ID: " + chunk.id);
                                data += chunk.data;
                                ++next_chunk;
                            }
                        });
                }
                server_res.writeHead(200, {
                    'Content-Type': 'text/calendar',
                    'Conlstent-Transfer-Encoding': 'Binary',
                    'Content-Length': data.length,
                    'Content-Disposition': `attachment; filename=${server_res.file_name}`
                });
                server_res.end(data);

                cache_save(url, data);

                l.log("Finished building, now sending to client...");
                return data;
            });
        });
    } catch(e) {
        l.error(`${e.message} -> ${url}`);
        if(e.message == "Invalid URL") {
            server_res.statusCode = 404;
            server_res.end("Invalid URL");
        }
    }
}

https.createServer(options, (req, res) => {
    requestListener(req, res);
}).listen(options.port);

l.log(`Server is running on https://${options.host}:${options.port}`);
l.log(`Server is running on https://kent-fix.transgirl.space/`);
