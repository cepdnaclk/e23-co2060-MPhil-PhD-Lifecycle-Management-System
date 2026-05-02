import Link from "next/link";

export default function ApplicationSuccessPage() {
  return (
    <main className="box-border flex h-[100dvh] items-center justify-center overflow-hidden bg-[#e0e0e0] px-4 py-6 text-black sm:px-6 sm:py-8">
      <div className="w-full max-w-lg rounded-[30px] border border-green-500 bg-[#e0e0e0] px-6 py-6 text-center shadow-[15px_15px_30px_#bebebe,-15px_-15px_30px_#ffffff] sm:px-8 sm:py-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
          {"\u2713"}
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-green-700">
          Submission Complete
        </p>
        <br/>
        <h1 className="mt-4 text-2xl font-semibold text-green-800">
          Application Submitted successfully.
        </h1>
        <br/>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-green-700">
          Your application has been received and is now ready for review by the postgraduate admissions team.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/" className="theme-button">
            <span className="theme-button__label">Back to Home</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
