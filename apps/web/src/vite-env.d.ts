/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Git SHA of the build; set by the web Docker image (see infra/docker/web.Dockerfile). */
  readonly VITE_RELEASE?: string;
}
