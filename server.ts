import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3001;

  // Store whiteboard state in memory (for demo purposes)
  // In a real app, this would be in a database
  const boards: Record<string, any[]> = {};
  const users: Record<string, { id: string; name: string; color: string }[]> = {};

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-board", ({ boardId, userName }: { boardId: string; userName: string }) => {
      socket.join(boardId);
      console.log(`User ${socket.id} (${userName}) joined board ${boardId}`);

      // Add user to the board's user list
      if (!users[boardId]) users[boardId] = [];

      // Generate a random color for the user
      const colors = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef'];
      const userColor = colors[Math.floor(Math.random() * colors.length)];

      const user = { id: socket.id, name: userName, color: userColor };
      users[boardId].push(user);

      // Send current state to the new user
      if (boards[boardId]) {
        socket.emit("init-state", boards[boardId]);
      } else {
        boards[boardId] = [];
      }

      // Broadcast updated user list to all users in the room
      io.to(boardId).emit("users-update", users[boardId]);
    });

    socket.on("draw-event", ({ boardId, element }: { boardId: string; element: any }) => {
      if (!boards[boardId]) boards[boardId] = [];
      
      // Check if it's an update to an existing element (e.g., during drawing)
      const index = boards[boardId].findIndex(e => e.id === element.id);
      if (index !== -1) {
        boards[boardId][index] = element;
      } else {
        boards[boardId].push(element);
      }

      // Broadcast to others in the room
      socket.to(boardId).emit("remote-draw", element);
    });

    socket.on("clear-board", (boardId: string) => {
      boards[boardId] = [];
      io.to(boardId).emit("board-cleared");
    });

    socket.on("cursor-move", ({ boardId, x, y }: { boardId: string; x: number; y: number }) => {
      socket.to(boardId).emit("remote-cursor", { userId: socket.id, x, y });
    });

    socket.on("cursor-leave", (boardId: string) => {
      socket.to(boardId).emit("cursor-hide", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);

      // Remove user from all boards
      for (const boardId in users) {
        const index = users[boardId].findIndex(u => u.id === socket.id);
        if (index !== -1) {
          users[boardId].splice(index, 1);
          // Broadcast updated user list
          io.to(boardId).emit("users-update", users[boardId]);
        }
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
