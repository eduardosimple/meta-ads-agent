"use client";

interface WizardProgressProps {
  currentStep: number; // 0-indexed (0=Campanha, 1=Conjunto, 2=Criativo, 3=Anúncio, 4=Revisão)
}

const STEPS = [
  { label: "Campanha", number: 1 },
  { label: "Conjunto", number: 2 },
  { label: "Criativo", number: 3 },
  { label: "Anúncio", number: 4 },
  { label: "Revisão", number: 5 },
];

export default function WizardProgress({ currentStep }: WizardProgressProps) {
  return (
    <div className="w-full px-4 py-6">
      <div className="flex items-center justify-center">
        {STEPS.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;
          const isFuture = index > currentStep;

          return (
            <div key={step.number} className="flex items-center">
              {/* Step circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                    isCompleted
                      ? "bg-green-500 text-white shadow-md"
                      : isActive
                      ? "bg-blue-600 text-white shadow-lg ring-4 ring-blue-200"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {isCompleted ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium whitespace-nowrap ${
                    isCompleted
                      ? "text-green-600"
                      : isActive
                      ? "text-blue-700"
                      : isFuture
                      ? "text-gray-400"
                      : "text-gray-500"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div
                  className={`h-1 w-16 sm:w-24 mx-1 mb-6 rounded-full transition-all duration-300 ${
                    index < currentStep ? "bg-green-400" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
