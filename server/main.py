from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"message": "Agents Farm server is running"}