"""
Simple DeepSeek API tester.

Run in PowerShell (after setting DEEPSEEK_API_KEY env variable):

    setx DEEPSEEK_API_KEY "sk-your-key-here"
    # then open NEW PowerShell window, cd into project, and:
    py test_deepseek.py

It will send a small prompt and print either the model reply
or details of any HTTP / auth / timeout error.
"""

import os
import json
import requests


def main() -> None:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        print("DEEPSEEK_API_KEY is not set in this shell.")
        print('In PowerShell, run:  $Env:DEEPSEEK_API_KEY = "sk-..."  then run this script again.')
        return

    url = "https://api.deepseek.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "are you human?."},
        ],
        "max_tokens": 64,
        "temperature": 0.5,
    }

    print("Sending test request to DeepSeek...")
    try:
        resp = requests.post(url, headers=headers, json=body, timeout=90)
    except Exception as e:
        print("Request failed:", repr(e))
        return

    print("HTTP status:", resp.status_code)

    # If not OK, print body for debugging
    if resp.status_code != 200:
        print("Response body (first 500 chars):")
        print(resp.text[:500])
        return

    try:
        data = resp.json()
    except Exception as e:
        print("Failed to parse JSON:", repr(e))
        print("Raw body (first 500 chars):")
        print(resp.text[:500])
        return

    try:
        content = data["choices"][0]["message"]["content"]
    except Exception as e:
        print("Unexpected JSON structure:", repr(e))
        print(json.dumps(data, indent=2)[:1000])
        return

    print("\nModel reply:")
    print(content)


if __name__ == "__main__":
    main()

