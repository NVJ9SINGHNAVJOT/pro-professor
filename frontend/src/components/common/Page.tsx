import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const Page = (props: { className?: string; children: ReactNode }) => {
  return <div className={cn("w-full min-h-[calc(100%-55px)]", props.className)}>{props.children}</div>;
};

export default Page;
