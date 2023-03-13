const http = require('http');
const https = require('https');

const l = require('@connibug/js-logging');
console.log("Current directory:", __dirname);
l.setLogLevel("DEBUG");
l.setupFileLogging(__dirname + "/")

var url_parse = require('url').parse;

const host = '10.10.10.2';
const port = 8000;

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
                    const pattern = /ORGANIZER;CN=University of Kent/;
                    const replacement = 'ORGANIZER;CN=University of Kent:filler@example.com';

                    chunk = chunk.toString()
                        .replace(pattern, replacement);
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
                    'Content-Type': 'application/zip',
                    'Conlstent-Transfer-Encoding': 'Binary',
                    'Content-Length': data.length,
                    'Content-Disposition': `attachment; filename=${server_res.file_name}`
                });
                server_res.end(data);

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

const server = http.createServer(requestListener);
server.listen(port, host, () => {
    l.log(`Server is running on http://${host}:${port}`);
});
