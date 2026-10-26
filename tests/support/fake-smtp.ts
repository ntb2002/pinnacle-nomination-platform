import net from "node:net";

/**
 * A minimal SMTP server for delivery tests: accepts mail, or refuses it (451 to
 * MAIL FROM) while `failing` is set. Records accepted messages.
 */
export async function startFakeSmtp() {
  const state = { failing: false, accepted: [] as string[], refused: 0 };
  const server = net.createServer((socket) => {
    let data: string | null = null;
    let buffer = "";
    socket.write("220 fake-smtp ready\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let i: number;
      while ((i = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (data !== null) {
          if (line === ".") {
            state.accepted.push(data);
            data = null;
            socket.write("250 queued\r\n");
          } else data += `${line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") socket.write("250 fake-smtp\r\n");
        else if (cmd === "MAIL") {
          if (state.failing) {
            state.refused++;
            socket.write("451 try again later\r\n");
          } else socket.write("250 ok\r\n");
        } else if (cmd === "RCPT") socket.write("250 ok\r\n");
        else if (cmd === "DATA") {
          data = "";
          socket.write("354 go ahead\r\n");
        } else if (cmd === "RSET" || cmd === "NOOP") socket.write("250 ok\r\n");
        else if (cmd === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("502 not implemented\r\n");
      }
    });
    socket.on("error", () => {});
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as net.AddressInfo;
  return {
    state,
    url: `smtp://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
