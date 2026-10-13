# agents-farm

A web page that shows Claude Code agents as little characters walking around a pixel-art farm, updated live through hooks and a Python FastAPI server.

## How to run

1. **Start the server** (in one terminal, from the project folder):

   ```
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn server.main:app --reload
   ```

   You only need `python3 -m venv .venv` and `pip install` the first time.

2. **Start the farm page** (in a second terminal, from the project folder):

   ```
   python3 -m http.server 5500 --directory web
   ```

3. **Open the browser** at http://localhost:5500

   Tip: open http://localhost:5500/?demo to see fake agents without the server.
