import { Suspense } from "react";
import PersonInfo from "./_components/person-info";
import { getCastByID } from "@/api/cast/cast";

export default async function page({
  params,
}: {
  params: Promise<{ personID: string }>;
}) {
  const personID = (await params).personID;
  const personDetailResponse = getCastByID(personID);
  return (
    <div className="mt-[72px] w-full flex flex-col flex-1 bg-foreground pt-10 pb-10 px-16">
      <Suspense
        fallback={
          <div className="w-full min-h-screen flex items-center justify-center bg-foreground">
            <p className="text-background text-xl">Loading</p>
          </div>
        }
      >
        <PersonInfo data={personDetailResponse} />
      </Suspense>
    </div>
  );
}
