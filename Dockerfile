# Stage 1: Build
FROM golang:1.22-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o me-bot ./cmd/server

# Stage 2: Run
FROM alpine:3.19
RUN apk add --no-cache tzdata ca-certificates
WORKDIR /app

COPY --from=builder /app/me-bot .
COPY assets/ ./assets/

EXPOSE 8080
CMD ["./me-bot"]
