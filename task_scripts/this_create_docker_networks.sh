#!/bin/bash

source ./logging.sh

# Create the ai-professor-backend-proxy network (internal)
create_ai_professor_backend_proxy_network() {
  # Check if the network already exists
  if docker network ls | grep -w "ai-professor-backend-proxy" > /dev/null 2>&1; then
    loginf "Network 'ai-professor-backend-proxy' already exists."
  else
    loginf "Creating internal network 'ai-professor-backend-proxy'..."
    if docker network create --driver bridge --internal "ai-professor-backend-proxy"; then
      logsuccess "'ai-professor-backend-proxy' network created."
    else
      logerr "Error: Failed to create network 'ai-professor-backend-proxy'."
      exit 1
    fi
    
  fi
}

create_ai_professor_backend_proxy_network
