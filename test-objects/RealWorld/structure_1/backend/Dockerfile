FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y libpq-dev \
    && apt-get install -y gcc


RUN pip install --upgrade pip 

COPY ./pyproject.toml .

RUN pip install .

COPY . .

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
 
ENV DEBUG=True

EXPOSE 8081

CMD ["sh", "-c", "python3 manage.py migrate && python3 manage.py runserver 0.0.0.0:8081"]
