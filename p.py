import requests
import json
import time
import random
from datetime import datetime

# Airtable API details
BASE_ID = "appA0Q5Vu9k7N0pgv"
TABLE_ID = "Tickets"
API_URL = f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_ID}"

print("API URL:", API_URL)

HEADERS = {
    "Authorization": "Bearer oaaq3Zq9DRsG1faAl.v1.eyJ1c2VySWQiOiJ1c3JMdzZWREJmZnR5a0hmbyIsImV4cGlyZXNBdCI6IjIwMjUtMDItMjBUMTg6NDU6NTEuMDAwWiIsIm9hdXRoQXBwbGljYXRpb25JZCI6Im9hcDgzMEFWZlZ2UVgzYlNyIiwic2VjcmV0IjoiZDE2OTA2NmY4Yzc3NmNlN2QzMDYxZWI2YWNkMWVmZjdmZTIzMmE0MDc1ZjM4MDVlMzk2MWMxMjMxNzY4MDEwZiJ9.0683020be7d926a695190c15d2a255a941a17bd02e15562f7345ecbc365e3fe7",
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
total_tickets = 200  # Adjust as needed

for i in range(0, total_tickets, batch_size):
    batch_records = [generate_ticket() for _ in range(batch_size)]
    data = {"records": batch_records}

    response = requests.post(API_URL, headers=HEADERS, data=json.dumps(data))

    if response.status_code == 200:
        print(f"✅ Batch {i//batch_size + 1} added successfully!")
    else:
        print(f"❌ Error in batch {i//batch_size + 1}: {response.text}")

    time.sleep(1)  # Avoid rate limiting
