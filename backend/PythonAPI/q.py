import json

# Define the constants
EMAIL = "23f2005664@ds.study.iitm.ac.in"
POST_URL = "https://tds-llm-analysis.s-anand.net/project2-tools"

# Revised Tool Call Plan (Attempt 3: Strict query and max_tokens=60)
tool_plan = [
  {
    "tool_name": "search_docs",
    "args": {
      # Using the exact wording from the prompt's main goal
      "query": "Find the status of issue 42 in repo demo/api"
    }
  },
  {
    "tool_name": "fetch_issue",
    "args": {
      "owner": "demo",
      "repo": "api",
      "id": 42
    }
  },
  {
    "tool_name": "summarize",
    "args": {
      "text": "$fetch_issue.output",
      # Using 60 to match the "60 words" part of the prompt
      "max_tokens": 60
    }
  }
]

# Convert the list of dictionaries to a compact JSON string
answer_string = json.dumps(tool_plan, separators=(',', ':'))

# Format the final response
final_result = {
    "email": EMAIL,
    "secret": 123,
    "url": POST_URL,
    "answer": answer_string
}

# Print the final JSON structure for the user to submit
print(json.dumps(final_result, indent=4))