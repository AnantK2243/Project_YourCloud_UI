#!/bin/bash

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Main deployment function
deploy() {
    log "Starting deployment..."
    
    # Pull latest code and rebuild
    log "Pulling latest code..."
    git pull origin prod || warning "Git pull failed"
    
    # Rebuild and restart container
    stop_all()
    docker-compose build
    docker-compose --profile tunnel up --build -d
}

# Function to show logs
show_logs() {
    docker-compose logs -f "$CONTAINER_NAME"
}

# Function to show status
show_status() {
    docker-compose ps
    echo ""
    docker images | grep yourcloud || echo "No images found"
}

# Function to completely stop everything
stop_all() {
    docker-compose down --remove-orphans
    docker network prune -f
}

# Main script logic
case "${1:-deploy}" in
    "deploy")
        deploy
        ;;
    "logs")
        show_logs
        ;;
    "stop")
        stop_all
        ;;
    "status")
        show_status
        ;;
    *)
        echo "Usage: $0 {deploy|logs|stop|status}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Deploy the latest version (default)"
        echo "  logs     - Show container logs"
        echo "  stop     - Stop all services and clean up"
        echo "  status   - Show current status"
        exit 1
        ;;
esac
