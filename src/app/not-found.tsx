import {
  Bank,
  Door,
  EmptyNotice,
  Sheet,
  Slots,
  BareRail,
} from "@/components/board";

/**
 * Missing and forbidden look the same on purpose: confirming a league exists
 * would let anyone probe for it. The board says so in its own voice rather
 * than Next's default 404.
 */
export default function NotFound() {
  return (
    <>
      <BareRail />
      <Sheet testId="not-found">
        <div className="flex max-w-xl flex-col gap-3">
          <h1 className="display text-4xl sm:text-5xl">
            That board is not here
          </h1>
          <EmptyNotice>
            A missing league and a league that is not yours look the same on
            purpose.
          </EmptyNotice>
        </div>
        <Bank framed label="Where to go">
          <Slots>
            <Door
              href="/"
              title="Your leagues"
              description="Open a board you already sit on, or start one."
              action="Open"
              testId="not-found-home"
            />
          </Slots>
        </Bank>
      </Sheet>
    </>
  );
}
