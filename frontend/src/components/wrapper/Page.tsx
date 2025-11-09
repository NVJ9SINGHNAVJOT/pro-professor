import { cn } from "@/utils/cn";
import type { ReactNode } from "react";

const Page = (props: { className?: string; children: ReactNode }) => {
  return <div className={cn("h-[calc(100%-55px)]", props.className)}>{props.children}</div>;
};

export default Page;
