import argparse, http.server, os, ssl, socketserver, sys, pdb
from urllib.parse import urlparse

crossOrigin = False 
# the build directory should come first
docRoots = ["build", "src", "lib"] ;

MIME_MAP = {
   "": "text/html",
   ".html": "text/html",
   ".js": "application/javascript",
   ".otf": "application/font-otf",
   ".pdf": "application/pdf",
   ".png": "image/png",
}

class PodiumHandler(http.server.SimpleHTTPRequestHandler):
  
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        print(args, kwargs)
        self.protocol_version = "HTTP/1.1"


    def do_HEAD(self):
        path = self.path[1:] 

        for root in docRoots:
            fullPath = os.path.abspath(os.path.join(root,path))
            if os.path.exists(fullPath):
                self.send_header("Accept-Ranges", "bytes") ;
                self.send_header("Content-Length", os.path.getsize(fullPath))
                self.send_header("content-length ", os.path.getsize(fullPath))
                self.end_headers()
                return 
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        scheme, netloc, path, params,query,fragment = urlparse(self.path)
        for root in docRoots:
            fullPath = os.path.abspath(os.path.join(root,path[1:]))
            if os.path.exists(fullPath):
              print("get:", fullPath) 
              self.send_response(200)
              filename, extension = os.path.splitext(path) ;
              self.send_header("content-type", MIME_MAP[extension] + "; charset=utf-8")
              # firefox doesn't like this keep alive scheme, sigh...it just hangs.
              # self.send_header("connection", "keep-alive")
              # self.send_header("keep-alive", "timeout=50, max=100")
              self.send_header("content-length", os.path.getsize(fullPath))
              self.send_header("cache-control", "no-store")
              if crossOrigin:
                self.send_header("Cross-Origin-Opener-Policy","same-origin") ;
                self.send_header("Cross-Origin-Embedder-Policy", "require-corp");
              self.end_headers()
              with open(fullPath, 'rb') as f:
                self.wfile.write(f.read())
              return
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
pargs = parser.parse_args()
crossOrigin = pargs.cross_origin
address = ('0.0.0.0', pargs.port)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain("./cert.pem", keyfile="key.pem") 
handler_class = PodiumHandler

while True:
    try:
        with http.server.ThreadingHTTPServer(address, handler_class) as httpd:
            httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
            print(f"Serving {address}")
            httpd.serve_forever()
    except Exception as ex: 
        print(ex)

