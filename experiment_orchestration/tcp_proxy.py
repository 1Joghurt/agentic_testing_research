import contextlib
import socket
import sys
import threading
from socket import socket as ss

listen_port = int(sys.argv[1])
target_host = sys.argv[2]
target_port = int(sys.argv[3])


def close_socket(sock: ss) -> None:
    """Close a socket without surfacing cleanup errors."""
    with contextlib.suppress(OSError):
        sock.shutdown(socket.SHUT_RDWR)
    sock.close()


def pipe(source: ss, destination: ss) -> None:
    """Forward bytes between two sockets until either side closes."""
    try:
        while True:
            data = source.recv(65536)
            if not data:
                break
            destination.sendall(data)
    except OSError:
        pass
    finally:
        close_socket(source)
        close_socket(destination)


with socket.create_server(("0.0.0.0", listen_port)) as server:
    while True:
        client, _ = server.accept()
        try:
            upstream = socket.create_connection((target_host, target_port), timeout=30)
        except OSError:
            close_socket(client)
            continue

        threading.Thread(target=pipe, args=(client, upstream), daemon=True).start()
        threading.Thread(target=pipe, args=(upstream, client), daemon=True).start()
