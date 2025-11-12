using Microsoft.AspNetCore.Mvc;
using MetabricksNFTService.Services;

namespace MetabricksNFTService.Controllers;

[ApiController]
[Route("api/[controller]")]
public class NFTController : ControllerBase
{
    private readonly INFTMintingService _nftMintingService;
    private readonly ILogger<NFTController> _logger;

    public NFTController(INFTMintingService nftMintingService, ILogger<NFTController> logger)
    {
        _nftMintingService = nftMintingService;
        _logger = logger;
    }

    [HttpPost("mint")]
    public async Task<IActionResult> MintNFT([FromBody] NFTMintingRequest request)
    {
        try
        {
            _logger.LogInformation("Received NFT minting request for brick: {BrickName}", request.BrickName);

            if (string.IsNullOrEmpty(request.BrickName) || string.IsNullOrEmpty(request.MetadataUri))
            {
                return BadRequest(new { error = "BrickName and MetadataUri are required" });
            }

            var result = await _nftMintingService.MintNFTAsync(request);

            if (result.Success)
            {
                _logger.LogInformation("NFT minted successfully. Mint: {Mint}, Tx: {Tx}", 
                    result.MintAddress, result.TransactionSignature);

                return Ok(new
                {
                    success = true,
                    mintAddress = result.MintAddress,
                    transactionSignature = result.TransactionSignature,
                    metadataUri = result.MetadataUri,
                    message = "MetaBrick NFT minted successfully!"
                });
            }
            else
            {
                _logger.LogError("NFT minting failed: {Error}", result.Error);
                return BadRequest(new
                {
                    success = false,
                    error = result.Error
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error in NFT minting endpoint");
            return StatusCode(500, new
            {
                success = false,
                error = "Internal server error during NFT minting"
            });
        }
    }

    [HttpGet("health")]
    public IActionResult Health()
    {
        return Ok(new { status = "healthy", service = "MetabricksNFTService", timestamp = DateTime.UtcNow });
    }
}


