namespace ScGen.Lib.Shared.DTOs.Responses;

/// <summary>
/// Response payload for AI-powered contract generation.
/// </summary>
public sealed class GenerateContractAIResponse
{
    /// <summary>
    /// Primary source code (best effort).
    /// </summary>
    public required string Code { get; init; }

    /// <summary>
    /// Base64-encoded ZIP archive containing the generated project scaffold.
    /// </summary>
    public required string ZipBase64 { get; init; }

    /// <summary>
    /// Generated contract specification in JSON format.
    /// </summary>
    public required string SpecJson { get; init; }

    /// <summary>
    /// Language identifier (Solidity, Rust, Scrypto).
    /// </summary>
    public required string Language { get; init; }

    /// <summary>
    /// Suggested program/contract name if available.
    /// </summary>
    public string? ProgramName { get; init; }

    /// <summary>
    /// Optional summary returned by the AI.
    /// </summary>
    public string? Summary { get; init; }

    /// <summary>
    /// Optional notes or recommendations.
    /// </summary>
    public IReadOnlyList<string> Recommendations { get; init; } = Array.Empty<string>();
}


