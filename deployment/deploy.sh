#!/bin/bash

set -e  # Exit on any error

# Configuration
CONTAINER_NAME="yourcloud-ui"
BACKUP_DIR="./backups"

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

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Function to create backup
create_backup() {
    log "Creating backup..."
    # Backup current docker-compose state
    docker-compose ps > "$BACKUP_DIR/containers-$(date +%Y%m%d-%H%M%S).txt" 2>/dev/null || true
    
    # Backup environment files
    if [ -f ".env" ]; then
        cp .env "$BACKUP_DIR/env-$(date +%Y%m%d-%H%M%S).bak"
    fi
    
    log "Backup created"
}

# Function to check if container is healthy
check_health() {
    local container_name=$1
    local max_attempts=15
    local attempt=1
    
    log "Checking container health..."
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose ps | grep -q "$container_name.*Up"; then
            log "Container is healthy!"
            return 0
        fi
        
        warning "Attempt $attempt/$max_attempts - Container not ready yet..."
        sleep 2
        ((attempt++))
    done
    
    error "❌ Container failed to start after $max_attempts attempts"
    return 1
}

# Main deployment function
deploy() {
    log "Starting deployment..."
    
    # Create backup
    create_backup
    
    # Pull latest code and rebuild
    log "Pulling latest code..."
    git pull origin prod || warning "Git pull failed"
    
    # Rebuild and restart container
    log "Rebuilding and restarting container..."
    docker-compose down "$CONTAINER_NAME" || warning "Container was not running"
    docker-compose build "$CONTAINER_NAME"
    docker-compose up -d "$CONTAINER_NAME"
    
    # Check health
    if check_health "$CONTAINER_NAME"; then
        log "Deployment successful!"
        
        # Clean up old images
        log "Cleaning up old images..."
        docker image prune -f
        
        log "Deployment completed successfully!"
    else
        error "Health check failed"
        exit 1
    fi
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

# Main script logic
case "${1:-deploy}" in
    "deploy")
        deploy
        ;;
    "logs")
        show_logs
        ;;
    "status")
        show_status
        ;;
    "backup")
        create_backup
        ;;
    *)
        echo "Usage: $0 {deploy|logs|status|backup}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Deploy the latest version (default)"
        echo "  logs     - Show container logs"
        echo "  status   - Show current status"
        echo "  backup   - Create a backup"
        exit 1
        ;;
esac
