# 1. Use a newer Python runtime (3.11) to match your local setup
FROM python:3.11-slim 

# 2. Install Git
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# 3. Set the working directory
WORKDIR /app

# 4. Copy the dependencies file
COPY requirements.txt .

# 5. Install dependencies
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# 6. Copy the rest of the backend code
COPY . .

# 7. Run the server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]