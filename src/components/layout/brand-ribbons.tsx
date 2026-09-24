import styles from "./brand-ribbons.module.css";

type BrandRibbonsProps = {
  placement: "header" | "footer";
};

export function BrandRibbons({ placement }: BrandRibbonsProps) {
  const colors = placement === "header" ? ["gold", "maroon"] : ["maroon", "gold"];

  return (
    <div className={styles.ribbons} data-brand-ribbons={placement} aria-hidden="true">
      {colors.map((color) => (
        <span
          className={`${styles.ribbon} ${styles[color]}`}
          data-ribbon-color={color}
          key={color}
        />
      ))}
    </div>
  );
}
