"""Static server for the demo.  python serve.py [port]   ->  http://localhost:8765/"""
import http.server, os, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".glb": "model/gltf-binary", ".json": "application/json"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


print("serving http://localhost:%d/" % port, flush=True)
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
