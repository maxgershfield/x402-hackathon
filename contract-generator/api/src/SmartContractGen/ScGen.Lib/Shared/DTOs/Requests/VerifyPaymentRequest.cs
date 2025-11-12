namespace ScGen.Lib.Shared.DTOs.Requests;

/// <summary>
/// Request to verify x402 payment
/// </summary>
public record VerifyPaymentRequest
{
    /// <summary>
    /// Solana transaction signature
    /// </summary>
    public required string Signature { get; init; }

    /// <summary>
    /// Operation being paid for (generate, compile, deploy)
    /// </summary>
    public required string Operation { get; init; }

    /// <summary>
    /// Blockchain/language (Solidity, Rust, Scrypto)
    /// </summary>
    public required string Blockchain { get; init; }

    /// <summary>
    /// Optional NFT mint address that should receive the revenue distribution.
    /// </summary>
    public string? NftMintAddress { get; init; }

    /// <summary>
    /// Amount paid in SOL
    /// </summary>
    public decimal Amount { get; init; }

    /// <summary>
    /// When true, skip comparing the amount against the static pricing table.
    /// Useful for variable priced flows like credit packs.
    /// </summary>
    public bool SkipPriceValidation { get; init; }
}

