import requests
import json


def debug_search(query):
    base_url = "https://archive.org/advancedsearch.php"

    # This mimics the website's broad search
    # q = "carl jung" (searches ALL metadata fields, not just author)
    params = {
        "q": f"({query}) AND mediatype:(texts)",
        "fl": ["identifier", "title", "creator", "date", "subject", "description"],
        "rows": 5,
        "page": 1,
        "output": "json",
        "sort": ["downloads desc"],
    }

    print(f"🔍 URL being hit: {base_url}")
    print(f"🔍 Params: {json.dumps(params, indent=2)}")

    try:
        resp = requests.get(base_url, params=params)
        print(f" Status Code: {resp.status_code}")

        data = resp.json()
        docs = data.get("response", {}).get("docs", [])

        print(f"\n FOUND {len(docs)} RESULTS:")
        for i, doc in enumerate(docs):
            print(f"\n--- Result {i+1} ---")
            print(f"ID:       {doc.get('identifier')}")
            print(f"Title:    {doc.get('title')}")
            # Observe exactly how 'creator' looks here!
            print(f"Creator:  {doc.get('creator')}  <-- CHECK THIS TYPE")
            print(f"Date:     {doc.get('date')}")

    except Exception as e:
        print(f" Error: {e}")


if __name__ == "__main__":
    debug_search("Carl Jung")
