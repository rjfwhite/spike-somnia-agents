"use client";

import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI } from "@/lib/contract";
import { formatEther } from "viem";
import type { TokenMetadata, MethodDefinition } from "@/lib/types";
import { encodeAbi, parseInputValue } from "@/lib/abi-utils";

export function CreateRequest() {
  const [agentId, setAgentId] = useState<string>("1");
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<MethodDefinition | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Read agent metadata URI
  const { data: tokenURI } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "tokenURI",
    args: agentId ? [BigInt(agentId)] : undefined,
  });

  // Read agent price
  const { data: price } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "agentPrice",
    args: agentId ? [BigInt(agentId)] : undefined,
  });

  // Fetch metadata when tokenURI changes
  useEffect(() => {
    if (!tokenURI) {
      setMetadata(null);
      setSelectedMethod(null);
      return;
    }

    const fetchMetadata = async () => {
      setMetadataLoading(true);
      try {
        const uri = tokenURI.toString();
        const response = await fetch(uri);
        if (!response.ok) {
          throw new Error(`Failed to fetch metadata: ${response.status}`);
        }
        const data = await response.json();
        setMetadata(data);

        // Auto-select first method if available
        const methods = data.agent_spec?.methods || data.methods;
        if (methods && methods.length > 0) {
          setSelectedMethod(methods[0]);
          // Initialize input values
          const initialValues: Record<string, string> = {};
          methods[0].inputs.forEach((input: any) => {
            initialValues[input.name] = '';
          });
          setInputValues(initialValues);
        }
      } catch (err) {
        console.error('Failed to fetch metadata:', err);
        setMetadata(null);
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchMetadata();
  }, [tokenURI]);

  // Update input values when method changes
  useEffect(() => {
    if (selectedMethod) {
      const initialValues: Record<string, string> = {};
      selectedMethod.inputs.forEach(input => {
        initialValues[input.name] = inputValues[input.name] || '';
      });
      setInputValues(initialValues);
    }
  }, [selectedMethod]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMethod) {
      return;
    }

    // Generate a random request ID
    const requestId = BigInt(Math.floor(Math.random() * 1000000000));

    // Parse and encode call data using ABI
    try {
      const values = selectedMethod.inputs.map(input => {
        const rawValue = inputValues[input.name] || '';
        return parseInputValue(rawValue, input.type);
      });

      const encodedCallData = encodeAbi(selectedMethod.inputs, values);

      writeContract({
        address: CONTRACT_ADDRESS,
        abi: SOMNIA_AGENTS_ABI,
        functionName: "createRequest",
        args: [requestId, BigInt(agentId), selectedMethod.name, encodedCallData],
        value: price || BigInt(0),
      });
    } catch (err: any) {
      console.error('Failed to encode call data:', err);
      alert(`Failed to encode call data: ${err.message}`);
    }
  };

  const methods = metadata?.agent_spec?.methods || metadata?.methods || [];

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 space-y-3 sm:space-y-4 border border-gray-200">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Create Agent Request</h2>

      <form onSubmit={handleCreateRequest} className="space-y-3 sm:space-y-4">
        <div>
          <label htmlFor="requestAgentId" className="block text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
            Agent ID
          </label>
          <input
            id="requestAgentId"
            type="number"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="1"
            min="1"
            required
          />
          {price !== undefined && (
            <p className="text-sm text-gray-700 font-medium mt-1.5 sm:mt-2">
              Agent Price: <span className="text-gray-900 font-semibold">{formatEther(price)} STT</span>
            </p>
          )}
        </div>

        {metadataLoading && (
          <p className="text-sm text-gray-600">Loading agent metadata...</p>
        )}

        {metadata && methods.length > 0 && (
          <>
            <div>
              <label htmlFor="method" className="block text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
                Method
              </label>
              <select
                id="method"
                value={selectedMethod?.name || ''}
                onChange={(e) => {
                  const method = methods.find(m => m.name === e.target.value);
                  setSelectedMethod(method || null);
                }}
                className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              >
                {methods.map((method: MethodDefinition) => (
                  <option key={method.name} value={method.name}>
                    {method.name}
                    {method.description && ` - ${method.description}`}
                  </option>
                ))}
              </select>
            </div>

            {selectedMethod && selectedMethod.inputs.length > 0 && (
              <div className="space-y-3 border border-gray-200 rounded-md p-3">
                <h3 className="text-sm font-semibold text-gray-900">Parameters</h3>
                {selectedMethod.inputs.map((input) => (
                  <div key={input.name}>
                    <label htmlFor={`input-${input.name}`} className="block text-sm font-medium text-gray-700 mb-1">
                      {input.name} <span className="font-mono text-xs text-gray-500">({input.type})</span>
                    </label>
                    <input
                      id={`input-${input.name}`}
                      type="text"
                      value={inputValues[input.name] || ''}
                      onChange={(e) => setInputValues({
                        ...inputValues,
                        [input.name]: e.target.value
                      })}
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder={
                        input.type.startsWith('uint') || input.type.startsWith('int') ? 'e.g., 123' :
                          input.type === 'bool' ? 'true or false' :
                            input.type === 'address' ? '0x...' :
                              input.type.endsWith('[]') ? '[value1, value2, ...]' :
                                'Enter value'
                      }
                      required
                    />
                  </div>
                ))}
              </div>
            )}

            {selectedMethod && selectedMethod.inputs.length === 0 && (
              <p className="text-sm text-gray-600 italic">This method takes no parameters</p>
            )}
          </>
        )}

        {metadata && methods.length === 0 && (
          <p className="text-sm text-yellow-700 bg-yellow-50 p-3 rounded border border-yellow-200">
            No methods found in agent metadata
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || isConfirming || !agentId || !selectedMethod || metadataLoading}
          className="w-full bg-purple-600 text-white py-3 sm:py-2.5 px-4 rounded-md hover:bg-purple-700 active:bg-purple-800 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors text-base sm:text-sm min-h-[48px] sm:min-h-0"
        >
          {isPending ? "Confirming..." : isConfirming ? "Creating..." : "Create Request"}
        </button>

        {hash && (
          <div className="text-sm bg-purple-50 p-3 rounded-md border border-purple-200">
            <p className="text-gray-900 font-semibold mb-1">Transaction Hash:</p>
            <p className="font-mono text-xs break-all text-gray-900">{hash}</p>
          </div>
        )}

        {isSuccess && (
          <div className="bg-green-100 border border-green-400 text-green-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded font-semibold text-sm">
            Request created successfully!
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded font-semibold text-sm break-words">
            Error: {error.message}
          </div>
        )}
      </form>
    </div>
  );
}
