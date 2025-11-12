namespace ScGen.Lib.Shared.DTOs.Requests;

/// <summary>
/// Natural-language AI contract generation request.
/// </summary>
public sealed class GenerateContractAIRequest
{
    /// <summary>
    /// Natural language description of the desired contract.
    /// </summary>
    public required string Description { get; init; }

    /// <summary>
    /// Target blockchain (solana, ethereum, radix). Defaults to solana.
    /// </summary>
    public string Blockchain { get; init; } = "solana";

    /// <summary>
    /// Optional extra context or constraints for generation.
    /// </summary>
    public string? AdditionalContext { get; init; }
}



