const stickers = [
  { src: "/login-stickers/almoxa-01.png", modifier: "almoxa" },
  { src: "/login-stickers/abra-aqui.png", modifier: "abra" },
  { src: "/login-stickers/conferido.png", modifier: "conferido" },
  { src: "/login-stickers/manuseie-com-cuidado.png", modifier: "manuseie" },
] as const;

export function LoginStickers() {
  return (
    <div className="login-stickers">
      {stickers.map((sticker) => (
        <img
          key={sticker.src}
          src={sticker.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={`login-sticker login-sticker--${sticker.modifier}`}
        />
      ))}
    </div>
  );
}
