import { useEffect, useRef } from 'react';

let sharedSocket = null;
const listeners = new Set()

export default function useSharedWebSocket(onMessage) {
  const wsRef = useRef(sharedSocket);

  useEffect(() => {
    if (!sharedSocket) {
      sharedSocket = new WebSocket(`ws://${window.location.hostname}:3000`);
      sharedSocket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        for (const cb of listeners) {
          cb(msg);
        }
      }
    }

    //add component's callback to listeners
    listeners.add(onMessage);

    // remove cb on unmount
    return () => {
      listeners.delete(onMessage);
    }

  }, [onMessage]);

  wsRef.current = sharedSocket;
  return wsRef;

}

