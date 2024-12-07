import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import "./GameCanvas.css";

interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityX: number;
  velocityY: number;
  lives: number;
  jumping: boolean;
  invincibleTime: number; // 初始无敌时间为 0
}

interface Block {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  fallSpeed: number;
  id: string;
  confirmed: boolean;
  isUniswap: boolean; // 是否是 Uniswap 交易
  isHighMEV: boolean; // 是否是 MEV 交易
}

const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<Player | null>(null);
  const blocksRef = useRef<Block[]>([]);
  const [player, setPlayer] = useState<Player>({
    x: 200,
    y: 400,
    width: 50,
    height: 50,
    velocityX: 0,
    velocityY: 0,
    lives: 100,
    jumping: false,
    invincibleTime: 0,
  });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [lowGravity, setLowGravity] = useState(false); // 用于控制低重力

  const gravity = lowGravity ? 0.3 : 0.5; // 根据 lowGravity 调整重力
  const blockSpeed = 5;
  const jumpStrength = lowGravity ? -15 : -10; // 跳跃力度
  const moveSpeed = 5;

  // 初始化 refs
  useEffect(() => {
    playerRef.current = player;
    blocksRef.current = blocks;
  }, [player, blocks]);

  // 创建方块
  const createBlock = (
    id: string,
    size: number,
    isUniswap: boolean = false,
    isHighMEV: boolean = false, // 新增标记
  ) => {
    const x = Math.random() * (canvasRef.current!.width - size);
    const fallSpeed = Math.min(Math.max(size / 10, 1), 5);
    setBlocks((prev) => [
      ...prev,
      {
        x,
        y: 0,
        width: size,
        height: size,
        speed: blockSpeed,
        fallSpeed,
        id,
        confirmed: false,
        isUniswap, // 记录是否是 Uniswap 方块
        isHighMEV, // 记录是否是高 MEV 方块
      },
    ]);
  };

  const getColorFromHash = (hash: string) => {
    // 通过哈希的不同部分来生成颜色，避免重复性
    const hashCode = parseInt(hash.substring(0, 8), 16);
    const r = (hashCode >> 16) & 0xff; // 获取红色部分
    const g = (hashCode >> 8) & 0xff; // 获取绿色部分
    const b = hashCode & 0xff; // 获取蓝色部分

    // 调整 RGB 范围，确保颜色更丰富
    const adjustedR = (r + 100) % 256;
    const adjustedG = (g + 150) % 256;
    const adjustedB = (b + 200) % 256;

    return `rgb(${adjustedR}, ${adjustedG}, ${adjustedB})`;
  };
  // 游戏循环
  const gameLoop = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制玩家
    const currentPlayer = playerRef.current!;
    if (currentPlayer.invincibleTime > 0) {
      // 如果在无敌时间内，闪烁玩家
      const shouldDrawPlayer =
        Math.floor(currentPlayer.invincibleTime / 100) % 2 === 0;
      if (shouldDrawPlayer) {
        ctx.fillStyle = "yellow";
        ctx.fillRect(
          currentPlayer.x,
          currentPlayer.y,
          currentPlayer.width,
          currentPlayer.height,
        );
      }
    } else {
      // 无敌时间结束，正常绘制玩家
      ctx.fillStyle = "yellow";
      ctx.fillRect(
        currentPlayer.x,
        currentPlayer.y,
        currentPlayer.width,
        currentPlayer.height,
      );
    }

    // 绘制方块
    blocksRef.current.forEach((block) => {
      if (!block.confirmed) {
        // 使用 txHash 生成颜色
        const blockColor = getColorFromHash(block.id);
        ctx.fillStyle = blockColor; // 设置根据哈希生成的颜色
        ctx.fillRect(block.x, block.y, block.width, block.height);

        if (block.isUniswap) {
          ctx.fillStyle = "white";
          ctx.font = "16px Arial";
          ctx.fillText("U", block.x + 5, block.y + block.height / 2); // 显示 Uni 文案
        }
        if (block.isHighMEV) {
          ctx.fillStyle = "white";
          ctx.font = "16px Arial";
          ctx.fillText("M", block.x + 5, block.y + block.height / 2);
        }
      }
    });

    // 显示分数和生命值
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    // ctx.fillText(`Lives: ${currentPlayer.lives}`, 10, 30); // 生命值
    ctx.fillText(`Score: ${score}`, 10, 60); // 分数

    // 检测游戏结束
    if (currentPlayer.lives <= 0 && !gameOver) {
      setGameOver(true);
      alert("Game Over");
      window.location.reload();
    }
  };

  // 方块逻辑
  const updateBlocks = () => {
    setBlocks((prev) =>
      prev
        .map((block) => ({
          ...block,
          y: block.y + block.fallSpeed,
        }))
        .filter((block) => {
          if (playerRef.current && isColliding(playerRef.current, block)) {
            if (block.isHighMEV) {
              setPlayer((prev) => ({
                ...prev,
                invincibleTime: prev.invincibleTime + 3 * 1000,
              }));
            }
            // 只有当 invincibleTime 为 0 时才扣生命值
            if (!block.isHighMEV && playerRef.current.invincibleTime === 0) {
              setPlayer((prev) => ({ ...prev, lives: prev.lives - 1 }));
            }
            return false;
          }
          return block.y < canvasRef.current!.height;
        }),
    );
  };

  const updatePlayer = () => {
    setPlayer((prev) => {
      let newX = prev.x + prev.velocityX;
      let newY = prev.y + prev.velocityY;
      let velocityY = prev.velocityY + gravity;

      if (newX < 0) newX = 0;
      if (newX + prev.width > canvasRef.current!.width) {
        newX = canvasRef.current!.width - prev.width;
      }

      if (newY + prev.height > canvasRef.current!.height) {
        newY = canvasRef.current!.height - prev.height;
        velocityY = 0;
        prev.jumping = false;
      }

      // 减少无敌时间
      if (prev.invincibleTime > 0) {
        prev.invincibleTime -= 1000 / 60; // 每帧减少1000/60毫秒
        if (prev.invincibleTime <= 0) {
          prev.invincibleTime = 0; // 防止变为负数
        }
      }

      return { ...prev, x: newX, y: newY, velocityY };
    });
  };

  const updateScore = () => {
    setScore((prev) => prev + 1);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setPlayer((prev) => ({ ...prev, velocityX: -moveSpeed }));
      }
      if (e.key === "ArrowRight") {
        setPlayer((prev) => ({ ...prev, velocityX: moveSpeed }));
      }
      if (e.key === " " && !player.jumping) {
        setPlayer((prev) => ({
          ...prev,
          velocityY: jumpStrength,
          jumping: true,
        }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        setPlayer((prev) => ({ ...prev, velocityX: 0 }));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [player]);

  useEffect(() => {
    const interval = setInterval(() => {
      updateBlocks();
      updatePlayer();
      updateScore();
      gameLoop();
    }, 1000 / 60);
    return () => clearInterval(interval);
  }, [score]);

  // 监听以太坊
  useEffect(() => {
    const provider = new ethers.providers.WebSocketProvider(
      "wss://ethereum-rpc.publicnode.com",
    );
    provider.on("pending", async (txHash: string) => {
      try {
        const tx = await provider.getTransaction(txHash);
        if (tx) {
          const isUniswap =
            tx.to?.toLowerCase() ===
            "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD".toLowerCase();

          // 判断交易是否为高 MEV 交易
          const gasUsage = tx.gasLimit.toNumber();
          const isHighMEV = gasUsage > 200000; // 例如，gasUsage > 100000 表示高 MEV 交易
          const size = Math.min(Math.max(gasUsage / 10000, 20), 60);

          if (isUniswap) {
            // console.log(tx, "Uniswap tx");
          }
          if (isHighMEV) {
            // console.log(tx, "High MEV tx");
          }

          createBlock(txHash, size, isUniswap, isHighMEV);
          if (isUniswap) {
            setLowGravity(true); // 发生 Uniswap 交易时设置低重力
            setTimeout(() => setLowGravity(false), 10000); // 10秒后恢复正常重力
          }
        }
      } catch (error) {
        console.error("Transaction error:", error);
      }
    });

    provider.on("confirmation", async (txHash: string) => {
      setBlocks((prev) =>
        prev.map((block) =>
          block.id === txHash ? { ...block, confirmed: true } : block,
        ),
      );
    });

    return () => {
      provider.removeAllListeners();
    };
  }, []);

  const isColliding = (rect1: Player, rect2: Block) => {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  };

  // 监听窗口尺寸变化
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };

    handleResize(); // 初始化 canvas 尺寸
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div>
      <canvas ref={canvasRef}></canvas>
      <div className="info">{gameOver && <h2>Game Over</h2>}</div>
      <div
        style={{
          position: "absolute", // 使用绝对定位
          top: "10px", // 距离顶部 10px
          left: "10px", // 距离左边 10px
          width: "400px", // 进度条的宽度
          zIndex: 10, // 设置较高的 z-index 使其显示在最上层
          fontSize: 20,
          display: "flex",
          alignItems: "center",
          color: "#fff",
        }}
      >
        <span>Lives: </span>
        <progress
          value={player.lives}
          max={100}
          style={{ width: "100%", height: "20px", margin: "0 4px" }}
        />
        <span>100/{player.lives}</span>
      </div>
    </div>
  );
};

export default GameCanvas;
