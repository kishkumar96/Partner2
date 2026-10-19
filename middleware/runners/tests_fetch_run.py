import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from runners import fetch_run

RUN = {
    "state": "COMPLETE",
    "outputs": [
        {"name": "t-regional-summary", "mediaType": "text/csv", "uri": "/api/outputs/1"},
        {"name": "t-wind-swaths", "mediaType": "application/geo+json", "uri": "/api/outputs/2"},
    ],
}
FILES = {"/api/outputs/1/download": b"Region\nAitutaki\n", "/api/outputs/2/download": b'{"type":"FeatureCollection"}'}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.headers.get("Authorization", "").startswith("Basic ") is False:
            self.send_response(401)
            self.end_headers()
            return
        if self.path == "/api/projects/1/runs/2":
            body = json.dumps(RUN).encode()
        elif self.path == "/api/projects/1/runs/3":
            body = json.dumps({"state": "RUNNING"}).encode()
        elif self.path in FILES:
            body = FILES[self.path]
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body)


class FetchRunTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Handler)
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_downloads_every_output_named_by_its_media_type(self):
        with tempfile.TemporaryDirectory() as tmp:
            saved = fetch_run.fetch("/api/projects/1/runs/2", Path(tmp), self.url, "secret")
            self.assertEqual(sorted(p.name for p in saved), ["t-regional-summary.csv", "t-wind-swaths.geojson"])
            self.assertEqual((Path(tmp) / "t-regional-summary.csv").read_bytes(), b"Region\nAitutaki\n")

    def test_a_web_page_path_is_given_the_api_prefix(self):
        self.assertEqual(fetch_run.api_path("/projects/1/runs/2", self.url), "/api/projects/1/runs/2")
        self.assertEqual(
            fetch_run.api_path("https://riskscape.nz/projects/1/runs/2", self.url), "/api/projects/1/runs/2"
        )

    def test_a_bare_run_number_uses_the_model_runs_address(self):
        self.assertEqual(fetch_run.api_path("20482", self.url), "/api/model-runs/by-id/20482")

    def test_an_unfinished_run_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp, self.assertRaisesRegex(fetch_run.FetchFailed, "RUNNING"):
            fetch_run.fetch("/api/projects/1/runs/3", Path(tmp), self.url, "secret")

    def test_a_shared_results_link_is_explained_not_fetched(self):
        with self.assertRaisesRegex(fetch_run.FetchFailed, "web page"):
            fetch_run.api_path("https://riskscape.nz/shared/results/abc==", self.url)

    def test_an_unknown_run_reports_the_http_status(self):
        with tempfile.TemporaryDirectory() as tmp, self.assertRaisesRegex(fetch_run.FetchFailed, "404"):
            fetch_run.fetch("/api/projects/1/runs/9", Path(tmp), self.url, "secret")
