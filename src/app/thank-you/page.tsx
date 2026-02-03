import Image from 'next/image'

export default function ThankYouPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg text-center">
        <Image
          src="https://aciqagqaiwsqerczchnx.supabase.co/storage/v1/object/public/assets/3.svg"
          alt="The Tree Consultancy"
          width={100}
          height={100}
          className="mx-auto mb-8"
        />
        
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Thank You!
          </h1>
          
          <p className="text-gray-600 mb-6">
            Your responses have been recorded successfully. Your feedback is valuable and will help improve organizational communication.
          </p>
          
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-emerald-800">
              🔒 Your responses are confidential and will only be used for aggregate analysis.
            </p>
          </div>
          
          <p className="text-sm text-gray-500">
            You may now close this window.
          </p>
        </div>
        
        <p className="mt-8 text-sm text-gray-400">
          Powered by The Tree Consultancy
        </p>
      </div>
    </main>
  )
}
