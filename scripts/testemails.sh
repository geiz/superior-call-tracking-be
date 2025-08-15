#!/bin/bash

BASE_URL="http://localhost:3001"

# 1. Test Registration (sends welcome email)
echo "Testing Registration with Email..."
curl -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@test.com",
    "password": "TestPass123!",
    "first_name": "Test",
    "last_name": "User",
    "phone": "4165551234"
  }'

echo -e "\n\n"

# 2. Login as admin to get token
echo "Logging in as admin..."
ADMIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@demo.com",
    "password": "password123"
  }')

TOKEN=$(echo $ADMIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Failed to get token. Check if admin@demo.com exists with password123"
  exit 1
fi

echo "Got token: ${TOKEN:0:20}..."

# 3. Invite a user (sends invitation email)
echo -e "\n\nInviting user to company..."
curl -X POST "$BASE_URL/api/invitations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "email": "dxs@hotmail.ca",
    "first_name": "Invited",
    "last_name": "User",
    "password": "TempPass123!",
    "role": "agent",
    "company_ids": [1],
    "default_company_id": 1,
    "send_email": true
  }'

echo -e "\n\n"

# 4. Test if Mailjet is configured
echo "Checking Mailjet configuration..."
if [ -z "$MAILJET_API_KEY" ] || [ -z "$MAILJET_SECRET_KEY" ]; then
  echo "⚠️  Mailjet not configured. Emails will be logged to console only."
  echo "To send real emails, set MAILJET_API_KEY and MAILJET_SECRET_KEY in .env"
else
  echo "✅ Mailjet is configured. Emails should be sent."
fi