import requests
import json
import time
import random
from datetime import datetime

# Airtable API details
BASE_ID = "appA0Q5Vu9k7N0pgv"
TABLE_ID = "tblq8PqlQcwHAYea3"
API_URL = f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_ID}"

print("API URL:", API_URL)

HEADERS = {
    "Authorization": "Bearer oaaJKNVkVPPwPlGyh.v1.eyJ1c2VySWQiOiJ1c3JMdzZWREJmZnR5a0hmbyIsImV4cGlyZXNBdCI6IjIwMjUtMDItMjRUMTM6MTU6MTguMDAwWiIsIm9hdXRoQXBwbGljYXRpb25JZCI6Im9hcDgzMEFWZlZ2UVgzYlNyIiwic2VjcmV0IjoiZmU5NGE3ODI3MDMxYzk1NGVhM2I1OTZiZmE4MzIzODNjOWQ3MmJiNmM5OTA2Mjc4YzI0ZWIwZDNiMWNjMGQ0YyJ9.dc5bbae3a3091bfbdbea29a92f799b0d2ec6a81f479005e11884034ffd52c62f",
    "Content-Type": "application/json"
}

# Sample Data Variations
titles = ["Slow Internet", "Laptop Not Booting", "Printer Issue", "VPN Not Connecting", "Email Not Working"]
statuses = ["In Progress", "Open", "Closed"]
priorities = ["Low", "Medium", "High"]
assignees = ["Maaz Shah", "John Doe", "Alice Brown", "David Lee", "Sophia Wilson"]

# Function to create a unique ticket
def generate_ticket():
    return {
        "fields": {
            "Title": random.choice(titles) + f" {random.randint(1000, 9999)}",  # Unique title
            "Description": f"Auto-generated ticket for {random.choice(titles)}",
            "Priority": random.choice(priorities),
            "Status": random.choice(statuses),
            "Resolution notes": "Issue pending resolution",
            "Employee Equipment": [],
        }
    }

# Generate 1000 tickets in batches of 10 (Airtable allows up to 10 records per request)
batch_size = 10
total_tickets = 150  # Adjust as needed

for i in range(0, total_tickets, batch_size):
    batch_records = [generate_ticket() for _ in range(batch_size)]
    data = {"records": batch_records}

    response = requests.post(API_URL, headers=HEADERS, data=json.dumps(data))

    if response.status_code == 200:
        print(f"✅ Batch {i//batch_size + 1} added successfully!")
    else:
        print(f"❌ Error in batch {i//batch_size + 1}: {response.text}")

    time.sleep(1)  # Avoid rate limiting
