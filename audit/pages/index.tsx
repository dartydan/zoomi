import dynamic from "next/dynamic";
import Head from "next/head";
const Audit = dynamic(() => import("../src/SaaSApp"), { ssr: false });
export default function Home() {
  return (
    <>
      <Head>
        <title>Audit by Zoomi</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" href="/favicon.svg" />
      </Head>
      <Audit />
    </>
  );
}
