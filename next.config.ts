import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // sharp (conversão de imagem) é binário nativo: fica fora do pacote e vai inteiro para a imagem
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
