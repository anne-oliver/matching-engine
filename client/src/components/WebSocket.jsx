import { useEffect, useRef } from 'react';

export default function useWebSocket(onMessage) {
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.hostname}:3000`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('webSocket connected');
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        onMessage(msg);
      } catch(err) {
        console.error('invalid ws message', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    }

    return () => {
      ws.close();
    };
  }, [onMessage]);

  return wsRef;

}