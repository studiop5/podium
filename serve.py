import argparse, http.server, os, ssl, socketserver, sys, logging
from urllib.parse import urlparse

crossOrigin = False
# the build directory should come first
docRoots = ["build", "src", "lib", "doc"]

MIME_MAP = {
   "": "text/html",
   ".html": "text/html",
   ".js": "application/javascript",
   ".otf": "application/font-otf",
   ".pdf": "application/pdf",
   ".png": "image/png",
   ".jpg": "image/jpeg",
   ".webm": "video/webm",
}

logger = logging.getLogger(__name__)

class PodiumHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    timeout = 30  # close idle connections after 30s

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def handle_one_request(self):
        """Handle a single HTTP request, catching malformed request errors."""
        try:
            super().handle_one_request()
        except Exception as e:
            # Silently ignore malformed requests from port scanners
            logger.debug(f"Malformed request ignored: {e}")

    def log_message(self, format, *args):
        # Override to use Python logging instead of stderr
        logger.info("%s - - [%s] %s" % (self.address_string(), self.log_date_time_string(), format % args))

    def do_HEAD(self):
        path = self.path[1:]

        for root in docRoots:
            fullPath = os.path.abspath(os.path.join(root, path))

            # Security: prevent path traversal
            rootPath = os.path.abspath(root)
            if not fullPath.startswith(rootPath):
                logger.warning(f"Path traversal attempt blocked: {self.path}")
                self.send_response(403)
                self.end_headers()
                return

            if os.path.exists(fullPath):
                self.send_response(200)
                filename, extension = os.path.splitext(path)
                mime_type = MIME_MAP.get(extension, "application/octet-stream")
                self.send_header("content-type", mime_type + "; charset=utf-8")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", os.path.getsize(fullPath))
                self.end_headers()
                return

        logger.debug(f"File not found: {self.path}")
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        scheme, netloc, path, params, query, fragment = urlparse(self.path)

        for root in docRoots:
            fullPath = os.path.abspath(os.path.join(root, path[1:]))

            # Security: prevent path traversal
            rootPath = os.path.abspath(root)
            if not fullPath.startswith(rootPath):
                logger.warning(f"Path traversal attempt blocked: {self.path}")
                self.send_response(403)
                self.end_headers()
                return

            if os.path.exists(fullPath):
              logger.debug(f"GET: {fullPath}")
              self.send_response(200)
              filename, extension = os.path.splitext(path)
              mime_type = MIME_MAP.get(extension, "application/octet-stream")
              self.send_header("content-type", mime_type + "; charset=utf-8")
              self.send_header("connection", "close")
              self.send_header("content-length", os.path.getsize(fullPath))
              self.send_header("cache-control", "no-store")
              if crossOrigin:
                self.send_header("Cross-Origin-Opener-Policy", "same-origin")
                self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
              self.end_headers()
              with open(fullPath, 'rb') as f:
                self.wfile.write(f.read())
              return

        logger.debug(f"File not found: {self.path}")
        self.send_response(404)
        self.end_headers()

    def do_PUT(self):
        # this is just sample code stolen from someone's post,
        # not yet tried.
        path = self.translate_path(self.path)
        if path.endswith('/'):
            self.send_response(405, "Method Not Allowed")
            self.wfile.write("PUT not allowed on a directory\n".encode())
            return
        else:
            try:
                os.makedirs(os.path.dirname(path))
            except FileExistsError: pass
            length = int(self.headers['Content-Length'])
            with open(path, 'wb') as f:
                f.write(self.rfile.read(length))
            self.send_response(201, "Created")


parser = argparse.ArgumentParser()
parser.add_argument('-p', '--port', nargs="?", const=True, default=9876, type=int, help='Listen port, defaults to 9876')
parser.add_argument('-c', '--cross_origin', nargs="?", default=False, help='Send same origin header, default=False')
parser.add_argument('-l', '--log-level', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'], default='INFO', help='Logging level (default: INFO)')
pargs = parser.parse_args()

# Configure logging
logging.basicConfig(
    level=getattr(logging, pargs.log_level),
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

crossOrigin = pargs.cross_origin
address = ('0.0.0.0', pargs.port)

# Check for SSL certificates
if not os.path.exists("./cert.pem") or not os.path.exists("./key.pem"):
    logger.error("SSL certificates not found (cert.pem and/or key.pem)")
    logger.error("Generate certificates with: python3 build.py --cert")
    sys.exit(1)

sslContext = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
sslContext.minimum_version = ssl.TLSVersion.TLSv1_2
sslContext.maximum_version = ssl.TLSVersion.TLSv1_3
sslContext.load_cert_chain("./cert.pem", keyfile="key.pem")

# Wrap SSL per-connection in threads, not on the listening socket.
# This prevents a stalled SSL handshake from blocking the main accept loop.
class ThreadedSSLServer(http.server.ThreadingHTTPServer):
    def get_request(self):
        (sock, addr) = super().get_request()
        sock.settimeout(30)
        sslSock = sslContext.wrap_socket(sock, server_side=True)
        return (sslSock, addr)

handler_class = PodiumHandler

logger.info(f"Starting HTTPS server on https://0.0.0.0:{pargs.port}")
logger.info(f"Document roots: {', '.join(docRoots)}")
logger.info(f"Cross-origin headers: {crossOrigin}")
logger.info(f"Log level: {pargs.log_level}")

try:
    with ThreadedSSLServer(address, handler_class) as httpd:
        httpd.serve_forever()
except KeyboardInterrupt:
    logger.info("\nShutting down server...")
    sys.exit(0)
except Exception as ex:
    logger.exception(f"Server error: {ex}")
    sys.exit(1)
