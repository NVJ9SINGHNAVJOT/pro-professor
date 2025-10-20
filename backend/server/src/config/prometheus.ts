import client from "prom-client";

// Enable default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics();

export default client;
