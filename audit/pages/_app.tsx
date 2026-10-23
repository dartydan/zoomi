import type { AppProps } from "next/app";
import "../src/styles.css";
export default function Application({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
